  var defaultSurfaces = [{"name":"1","points":[[{"x":0.14900511379241937,"y":0.20165,"z":1},{"x":0.5810051137924194,"y":0.35645000000000004,"z":1},{"x":0.9180056819915772,"y":0.1552272720336914,"z":1}],[{"x":0.4676051137924194,"y":0.5058499999999999,"z":2},{"x":0.6098051137924194,"y":0.49145,"z":2},{"x":0.7736051137924195,"y":0.49685,"z":2}],[{"x":0.22400568199157714,"y":0.8532272720336914,"z":3},{"x":0.6116051137924194,"y":0.59225,"z":3},{"x":0.9920056819915771,"y":0.8152272720336914,"z":1}]]}]
$( document ).ready(function()
{
  main()

})

function main()
{
  var HISTORY_MAX_SIZE = 50
  var HIGH_RES_PIX_PER_SAMPLE  = 3 //determines the texture resolution
  var LOW_RES_PIX_PER_SAMPLE  = 30
  var TEXTURE_BLACK_ZERO_THRESHOLD = 0.003 //determines the height lines thinkness 
  var NUMBER_OF_Z_LEVELS = 10

  //colors
  var HEIGHT_LINE_COLOR               = "rgb(200, 200, 200)"
  var CURRENT_SURFACE_POINT_COLOR     = "rgb(0, 0, 200)"
  var CURRENT_SURFACE_LINE_COLOR      = "rgb(0, 0, 230)"
  var NON_CURRENT_SURFACE_POINT_COLOR = "rgb(200, 200, 200)"
  var NON_CURRENT_SURFACE_LINE_COLOR  = "rgb(200, 200, 200)"
  var CURRENT_GRID_CURVE_COLOR        = "rgb(255, 0, 0)"
  var NON_CURRENT_GRID_CURVE_COLOR    = "rgb(255, 20, 20)"
  var TEXT_COLOR                      = "rgb(0, 0, 0)"
  var TEXT_BACKGROUND_COLOR           = "rgba(255, 255, 255, 0.9)"
  var SELECTED_POINT_COLOR            = "rgb(255, 0, 255)"
  var SKELETON_POINTS_COLOR           = "rgb(0, 0, 0)"
  var MOUSE_POSITION_COLOR            = "rgb(0, 255, 0)"
  var currentlyDrawingTexture = false

  //texture data cache for surfaces (assumed NUMBER_OF_SURFACES = 2)
  var textureData = [[], []]

  //default drawn texture
  var shouldDrawJacobian = false
  var shouldDrawDepth = true

  //the file we work on
  var currentFileName = "surfaces.json"

  var lastDrawTimestamp = (new Date).getTime()
  var lastLowResDrawn = 0
  var history = [], forwardHistory = []
  var timer, deCasteljauCurveRatio = 1
  var surfaces
  var selectedPointOnParameter = -1
  var mouseOnParameter = -1
  var currentSurfaceId = 0
  var physicalCanvas, physicalCtx
  var parameterCanvas, parameterCtx
  var width, height, height1, plotWidth, doublePlotWidth,  dragId = -1
  var zoomDepth = 1
  var zoomedAveragePoint = -1
  init()
  redraw()

  function init()
  {
    surfaces = defaultSurfaces
    shouldDrawSkeleton = true

    updateSurfacesList()
    physicalCanvas = $("#physicalCanvas").get(0)
    physicalCtx = physicalCanvas.getContext("2d")
    parameterCanvas = $("#parameterCanvas").get(0)
    parameterCtx = parameterCanvas.getContext("2d")
    $("#fileInput").change(loadSurfaces)
    $("#downloadButton").click(saveSurfaces)
    $("#surfacesList").change(changeCurrentSurface)
    $("#parameterCanvas").mousemove(mouseMoveParameter)
    $("#parameterCanvas").mouseleave(mouseLeave)
    $("#parameterCanvas").mouseup(mouseUpParameter)
    $("#physicalCanvas").mousemove(drag)
    $("#physicalCanvas").mousedown(startDrag)
    $("#physicalCanvas").mouseup(stopDrag)
    $("input:radio").change(redraw)
    //Mobile support
    $(document).keyup(onKeyUp)
    $("#radio10").prop("checked", true)
    pushToHistory()
  }


  function getZ(surface, u, v)
  {
    return deCasteljauSurface(surface, u, v).pop()[0][0].z
  }

  function add(point1, point2)
  {
    return {
      x : point1.x + point2.x,
      y : point1.y + point2.y,
      z : point1.z + point2.z,
    }

  }

  function addScalar(point, scalar)
  {
    return {
      x : point.x + scalar,
      y : point.y + scalar,
      z : point.z + scalar
    }

  }


  function sub(point1, point2)
  {
    return add(point1, mul(point2, -1))
  }

  function mul(point, scalar)
  {
    return {
      x : point.x * scalar,
      y : point.y * scalar,
      z : point.z * scalar
    }
  }

  function pointToString(point)
  {
    return "(" + point.x.toFixed(2) + ", " + point.y.toFixed(2) + ", " + point.z.toFixed(2) + ")"
  }

  function mouseLeave()
  {
    mouseOnParameter = -1
    if (shouldDrawJacobian || shouldDrawDepth)
    {
      redrawTextureData()
      return
    }
    redraw()
  }
  function undo()
  {
    //Nothing in history
    if (history.length == 0)
    {
      return
    }
    forwardHistory.push(surfaces)

    surfaces = history.pop()
    if (currentSurfaceId >= surfaces.length)
    {
      currentSurfaceId = 0
    }
    updateSurfacesList()
    redraw()
  }

  function redo()
  {
    if (forwardHistory.length == 0)
    {
      return
    }
    history.push(surfaces)
    surfaces = forwardHistory.pop()
    if (currentSurfaceId >= surfaces.length)
    {
      currentSurfaceId = 0
    }
    updateSurfacesList()
    redraw()
  }

  function pushToHistory()
  {
    //Deep copy
    var surfacesCopy = $.extend(true, [], surfaces)

    history.push(surfacesCopy)
    //Keep history size limited
    if (history.length > HISTORY_MAX_SIZE)
    {
      history.shift()
    }
    forwardHistory = []
  }


  function updateSurfacesList()
  {
    //remake list element in HTML
    $('#surfacesList').empty()
    for (var i=0; i < surfaces.length; i++)
    {
      if (i==1)
      {
        $("#surfacesList").append($("<option selected/>").text(surfaces[i].name))
      }
      else
      {
        $("#surfacesList").append($("<option />").text(surfaces[i].name))
      }
    }

    //Make sure the current curve is selected
    if($("#surfacesList option").size() > currentSurfaceId)
    {
      $("#surfacesList").val(currentSurfaceId + 1)
      return
    }
    //select first curve
    $("#surfacesList").val(1)
  }

  function changeCurrentSurface()
  {
    currentSurfaceId = $("#surfacesList")[0].selectedIndex
    selectedPointOnParameter = -1
    redraw()
  }

  //Load surfaces from file which is selected in "browse..." element
  function loadSurfaces(ev)
  {

    var file = $("#fileInput")[0].files[0]; // FileList object
    var reader = new FileReader()
    currentFileName = file.name
    $("#fileName").text(file.name)
    document.title = "(" + file.name + ") Bezier Surface (planar2)"
    
    // Closure to capture the file information.
    reader.onload = function(e)
    {
      pushToHistory()
      surfaces = JSON.parse(reader.result)
      //Support Z less JSON format (old)
      for(k = 0; k < surfaces.length; k++)
      {
        for(i = 0; i < surfaces[k].points.length; i++)
        {
          for(j = 0; j < surfaces[k].points[i].length; j++)
          {
            if (!("z" in surfaces[k].points[i][j]))
            {
              surfaces[k].points[i][j].z = 0.0
              shouldDrawDepth = false
              shouldDrawJacobian = true
            }
          }
        }
      }
      redraw()
    }

    // Read in the image file as a data URL.
    reader.readAsText(file)
  }


  //download current surfaces in JSON format
  function saveSurfaces()
  {
    download(currentFileName, JSON.stringify(surfaces, null, 2))
  }

  //Download given text as a file with the given filename
  function download(filename, text)
  {
    var pom = document.createElement('a')
    pom.setAttribute('href', 'data:text/plain;charset=utf-8,' + encodeURIComponent(text))
    pom.setAttribute('download', filename)

    if (document.createEvent) {
        var event = document.createEvent('MouseEvents')
        event.initEvent('click', true, true)
        pom.dispatchEvent(event)
    }
    else {
        pom.click()
    }
  }

  //fire up event handlers after keyboard press event
  function onKeyUp(ev)
  {
    switch(ev.keyCode)
    {
      //+
      case 187:
      case 107:
      case 61:
        zoom(true)
        redraw()
        break
      //-
      case 189:
      case 109:
      case 173:
        zoom(false)
        redraw()
        break
      //Z
      case 90:
        if (ev.ctrlKey)
        {
          undo()
        }
        break
      //C
      case 67:
        shouldDrawSkeleton = !shouldDrawSkeleton
        redraw()
        break
      //J
      case 74:
        shouldDrawJacobian = !shouldDrawJacobian
        shouldDrawDepth = false
        redraw()
        break
      //D
      case 68:
        shouldDrawDepth = !shouldDrawDepth
        shouldDrawJacobian = false
        redraw()
        break
      //Y
      case 89:
        if (ev.ctrlKey)
        {
          redo()
        }
        break
    }
  }



  function getLinesAmountInGrid()
  {
    return parseInt($("input[name=grid]:checked", "#gridForm").val())
  }

  function drawParameterGrid()
  {

    if (surfaces.length == 0 || surfaces[currentSurfaceId].points.length == 0 )
    {
      return
    }
    linesInGrid = getLinesAmountInGrid() + 1

    for (var u = 0; u <= linesInGrid; u += 1 )
    {
      drawParameterLine(u / linesInGrid, true, CURRENT_GRID_CURVE_COLOR);
    }
    for (var v = 0; v <= linesInGrid; v += 1)
    {
      drawParameterLine(v / linesInGrid, false, CURRENT_GRID_CURVE_COLOR);
    }
  }

  function drawParameterLine(value, isHorizontal, lineColor)
  {
    parameterCtx.lineWidth = plotWidth
    parameterCtx.strokeStyle = lineColor
    parameterCtx.beginPath()
    if (isHorizontal)
    {
      parameterCtx.moveTo(0, height1 * (1 - value))
      parameterCtx.lineTo(width, height1 * (1 - value))
    }
    else
    {
      parameterCtx.moveTo(width * value, 0)
      parameterCtx.lineTo(width * value, height)
    }
    parameterCtx.stroke()
  }

  //Add to canvas lines and points of given polygon
  // (polygon is open, last and first points are not drawn)
  // used to draw the control polygon and the DeCasteljau skeleton
  function drawPolygon(polygonPoints, lineWidth, lineColor, pointColor, isCurrent, rowIndex)
  {
    physicalCtx.lineWidth = lineWidth
    physicalCtx.beginPath()
    zoomedPoint = zoomPoint(true, polygonPoints[0])
    physicalCtx.moveTo(zoomedPoint.x * width, height1 * (1 - zoomedPoint.y))
    for (var i = 0; i < polygonPoints.length; i++)
    {
      zoomedPoint = zoomPoint(true, polygonPoints[i])
      //Point
      physicalCtx.strokeStyle = pointColor
      physicalCtx.strokeRect(zoomedPoint.x * width - plotWidth,
                          height1 * (1 - zoomedPoint.y) - plotWidth,
                          doublePlotWidth,
                          doublePlotWidth)
      physicalCtx.stroke()
      //Line
      physicalCtx.strokeStyle = lineColor
      physicalCtx.lineTo(zoomedPoint.x * width, height1 * (1 - zoomedPoint.y))
      physicalCtx.stroke()
      if (isCurrent && rowIndex != -1)
      {
        //Write Point id
        physicalCtx.fillStyle = TEXT_COLOR
        physicalCtx.font="15px Courier New"
        pointString = "P(" + i.toString() + "," + rowIndex.toString() + ")"
        physicalCtx.fillText(pointString, width * zoomedPoint.x + 10, height1 * ( 1- zoomedPoint.y))
      }
    }
  }

  function findMinMax(step, func)
  {
    min = Number.POSITIVE_INFINITY
    max = Number.NEGATIVE_INFINITY
    for (var u = 0; u < 1; u += step)
    {
      for (var v = 0; v < 1; v += step)
      {
        val = func(surfaces[currentSurfaceId], u, v)
        if (val < min)
        {
          min = val
        }
        if (val > max)
        {
          max = val
        }
      }
    }
    /*
    Note (see note at getJacobian):
    We add epsilons here to avoid the black screen which is caused by a too narrow
    values range that occurs when all Jacobian values in the surface are the same.
    */
    return [min - Number.EPSILON, max + Number.EPSILON]
  }

  /*
  Performance Note:
  We did this weird row-by-row drawing, where every row drawing is an event handler
  to avoid freezing the canvas with a single and heavy event handler that calculates
  the Jacobian value of all pixel. JS multi-threading might make this even faster.
  */
  function drawTextureRow(v, pixelsPerSample, movementTime, min, max, func, blackFunc)
  {
    step = pixelsPerSample / (2 * width)
    if(surfaces.length == 0)
    {
      currentlyDrawingTexture = false
      return
    }
    if ((v >= 1) || (lastDrawTimestamp > movementTime))
    {
      if (v >= 1)
      {
        currentlyDrawingTexture = false
      }
      return
    }
    textureData.push([])
    for (var u = 0; u < 1; u += step)
    {
      point = deCasteljauSurface(surfaces[currentSurfaceId], u, v).pop()[0][0]
      point = zoomPoint(true, point)
      val = func(surfaces[currentSurfaceId], u, v)

      /*
      Note:
      Here we set a range that will be colored black.
      This will give visual indication of the area where the Jacobian is "zero"
      */
      if (blackFunc(val, max, min))
      {
        color = HEIGHT_LINE_COLOR
      }
      else
      {
        shade = (val - min) / (max - min)
        /*
        Note:
        To determine an approximation of the Jacobian values range, we sampled the surface
        before drawing the values in higher resolution. Values that are drawn in between the
        samples might exceed the max\min that was sampled, so we round these exceeding values
        to fit in the approximated range. If the sampling resolution constant is high enough
        and the surface is not to extreme in its values, it shouldn't be visible.
        */
        if (shade > 1)
        {
          shade = 1
        }
        if ( shade < 0)
        {
          shade = 0
        }
        color = shadeToColor(shade)
      }
      textureData[textureData.length - 1].push(color)
      physicalCtx.fillStyle = color
      physicalCtx.fillRect(point.x * width, height1 * (1 - point.y), pixelsPerSample * zoomDepth, pixelsPerSample * zoomDepth)
      parameterCtx.fillStyle = color
      parameterCtx.fillRect(u * width, height1 * (1 - v), pixelsPerSample, pixelsPerSample)
    }
    setTimeout(function(){drawTextureRow(v + step, pixelsPerSample, movementTime, min, max, func, blackFunc)})
  }

  function drawTexture(func, blackFunc)
  {
    if(surfaces.length == 0 ||
      !(surfaces[currentSurfaceId].points.length > 1 &&
        surfaces[currentSurfaceId].points[0].length > 1))
    {
      return
    }
    minMax = findMinMax(LOW_RES_PIX_PER_SAMPLE.toFixed(2) / width, func)
    min = minMax[0]
    max = minMax[1]
    textureData = []
    currentlyDrawingTexture = true
    drawTextureRow(0, HIGH_RES_PIX_PER_SAMPLE, lastDrawTimestamp, min, max, func, blackFunc)
  }

  function drawSurfaces()
  {
    if (surfaces.length == 0)
    {
      return
    }
    for (var i = 0; i < surfaces.length; i++)
    {
      drawSurface(surfaces[i], i == currentSurfaceId)
    }
    if (selectedPointOnParameter == -1)
    {
      return
    }
    //Draw point on surface
    drawParameterLine(selectedPointOnParameter.u, false, SELECTED_POINT_COLOR)
    drawParameterLine(selectedPointOnParameter.v, true, SELECTED_POINT_COLOR)
    plotCurveOnSurface(surfaces[currentSurfaceId], selectedPointOnParameter.u, true, SELECTED_POINT_COLOR)
    plotCurveOnSurface(surfaces[currentSurfaceId], selectedPointOnParameter.v, false, SELECTED_POINT_COLOR)
  }

  function drawSurfaceControls(surface, lineColor, pointColor, isCurrent)
  {

    for (var i = 0; i < surface.points[0].length; i++)
    {
      drawPolygon(getColumn(surface.points, i), doublePlotWidth, lineColor, pointColor, isCurrent, -1)
    }
    for (var i = 0; i < surface.points.length; i++)
    {
      rowIndex = -1
      if (!shouldDrawJacobian && !shouldDrawDepth)
      {
        rowIndex = i
      }
      drawPolygon(surface.points[i], doublePlotWidth, lineColor, pointColor, isCurrent, rowIndex)
    }
  }

  function drawSurface(surface, isCurrent)
  {

    if (surface.points.length == 0 || surface.points[0].length == 0)
    {
      return
    }
    //disabled colors
    var lineColor = NON_CURRENT_SURFACE_LINE_COLOR
    var pointColor = NON_CURRENT_SURFACE_POINT_COLOR
    if (isCurrent)
    {
      //enabled colors
      lineColor = CURRENT_SURFACE_LINE_COLOR
      pointColor = CURRENT_SURFACE_POINT_COLOR
    }

    drawSurfaceControls(surface, lineColor, pointColor, isCurrent)
    //plot curve
    var curveColor = NON_CURRENT_GRID_CURVE_COLOR
    if (isCurrent)
    {
      curveColor = CURRENT_GRID_CURVE_COLOR
    }
    linesInGrid = getLinesAmountInGrid() + 1
    //for (var u = 0; u <= 1; u += 1 / (surface.points.length - 1))
    for (var u = 0; u <= linesInGrid; u += 1)
    {
      plotCurveOnSurface(surface, u / linesInGrid, true, curveColor);
    }

    //for (var v = 0; v <= 1; v += 1 / (surface.points[0].length - 1))
    for (var v = 0; v <= linesInGrid; v += 1)
    {
      plotCurveOnSurface(surface, v / linesInGrid, false, curveColor);
    }
  }

  function plotCurveOnSurface(surface, value, isHorizontal, curveColor)
  {
    physicalCtx.lineWidth = doublePlotWidth
    var step = 1 / width
    var lastStep

    if (isHorizontal)
    {
      lastStep = deCasteljauSurface(surface, value, 0).pop()[0][0]
    }
    else
    {
      lastStep = deCasteljauSurface(surface, 0, value).pop()[0][0]
    }
    lastStep = zoomPoint(true, lastStep)
    //Draw Curve step
    for (var t = 0; t < 1; t += step)
    {
      if (isHorizontal)
      {
        curveStep = deCasteljauSurface(surface, value, t).pop()[0][0]
      }
      else
      {
        curveStep = deCasteljauSurface(surface, t, value).pop()[0][0]
      }
      curveStep = zoomPoint(true, curveStep)
      physicalCtx.strokeStyle = curveColor
      physicalCtx.beginPath()
      physicalCtx.moveTo(lastStep.x * width, height1 * (1 - lastStep.y))
      physicalCtx.lineTo(curveStep.x * width, height1 * (1 - curveStep.y))
      physicalCtx.stroke()
      lastStep = curveStep
    }
  }

  function removeRowAndColumn(surface, rowIndex, columnIndex)
  {
    newSurface = jQuery.extend(true, {}, surface)
    newSurface.points.splice(rowIndex, 1)
    for (var i = 0; i < newSurface.points.length; i++)
    {
      newSurface.points[i].splice(columnIndex , 1)
    }
    return newSurface
  }

  function getzoomedAveragePoint()
  {
    amount = 0
    sumPoint = {x : 0.0, y: 0.0, z:0.0}
    for (var k = 0; k < surfaces.length; k++)
    {
      for (var i = 0; i < surfaces[k].points.length; i++)
      {
        for (var j = 0; j < surfaces[k].points[i].length; j++)
        {
          sumPoint = add(sumPoint, surfaces[k].points[i][j])
          amount += 1
        }
      }
    }
    return mul(sumPoint, zoomDepth/amount)
  }

  function zoom(zoomIn)
  {

    factor = 0.9
    if (zoomIn)
    {
      factor = 1.1
    }
    zoomDepth *= factor
  }

  function zoomPoint(zoomIn, point)
  {
    pointCopy = $.extend(true, {}, point)
    //center of screen, the camera is static
    diff = sub(zoomedAveragePoint, {x: 0.5, y:0.5, z:0.5})
    //strech
    if (zoomIn)
    {
      pointCopy = mul(pointCopy, zoomDepth)
      pointCopy = sub(pointCopy, diff)
    }
    else
    {
      pointCopy = add(pointCopy, diff)
      pointCopy = mul(pointCopy, 1.0 / zoomDepth)
      
    }
    return pointCopy
  }

  function writeStatus(physicalMouseCoordinates)
  {
    writeStatusParameter(physicalMouseCoordinates)
    writeStatusPhysical(physicalMouseCoordinates)
  }
  function writeStatusPhysical(physicalMouseCoordinates)
  {
    var deCasteljauCurveStatus = "Off"
    var jacobianStatus = "Off"
    var depthStatus = "Off"
    if (shouldDrawJacobian)
    {
      jacobianStatus = "On"
    }
    if (shouldDrawDepth)
    {
      depthStatus = "On"
    }
    if (shouldDrawSkeleton)
    {
      deCasteljauCurveStatus = "On"
    }
    //White background
    physicalCtx.fillStyle = TEXT_BACKGROUND_COLOR
    physicalCtx.fillRect(0,1,210,90);
    //text
    physicalCtx.fillStyle = TEXT_COLOR
    physicalCtx.font="15px Courier New"
    physicalCtx.fillText("[+/-] Zoom", 5, 20)
    physicalCtx.fillText("[j] Jacobian: " + jacobianStatus, 5, 35)
    physicalCtx.fillText("[d] Depth: " + depthStatus, 5, 50)
    physicalCtx.fillText("[c] De-Casteljau: " + deCasteljauCurveStatus, 5, 65)

  }

  function writeStatusParameter(physicalMouseCoordinates)
  {

    if (mouseOnParameter == -1)
    {
      return
    }
    //white background
    parameterCtx.fillStyle = TEXT_BACKGROUND_COLOR
    parameterCtx.fillRect(0,1,250,70);
    //text
    parameterCtx.fillStyle = TEXT_COLOR
    parameterCtx.font="bold 15px Courier New"
    parameterCtx.fillText("Param: (" + mouseOnParameter.u.toFixed(2) + ", " + mouseOnParameter.v.toFixed(2) +")", 5, 20)
    parameterCtx.fillText("Physi: " + pointToString(physicalMouseCoordinates), 5, 35)

    jacVal = getJacobian(surfaces[currentSurfaceId], mouseOnParameter.u, mouseOnParameter.v)
    parameterCtx.fillText("Jacobian: " + jacVal.toFixed(3), 5, 50)
    z = getZ(surfaces[currentSurfaceId], mouseOnParameter.u, mouseOnParameter.v)
  }
  
  function makeSurfacesPlanar4()
  {
    surfaces = [surfaces[0]]
    makePlanar4(surfaces[0])
    updateSurfacesList()
  }
  
  function redraw()
  {
    zoomedAveragePoint = getzoomedAveragePoint()
    lastDrawTimestamp = (new Date).getTime()
    makeSurfacesPlanar4()
    physicalCtx.clearRect(0,0, width, height)
    parameterCtx.clearRect(0,0, width, height)
    height = physicalCtx.canvas.height
    width = physicalCtx.canvas.width
    height1 = height-1
    plotWidth = Math.max(1, Math.round(width / 250))
    doublePlotWidth = 2 * plotWidth
    physicalCanvas.width = width
    physicalCanvas.height = height
    parameterCanvas.width = width
    parameterCanvas.height = height
    if (shouldDrawJacobian)
    {
      drawTexture(getJacobian, function (val, max, min)
      {
        return Math.abs(val) < TEXTURE_BLACK_ZERO_THRESHOLD * (max - min)
      })
    }
    else if (shouldDrawDepth)
    {
      drawTexture(getZ, function (val, max, min)
      {
        for (var i = 0; i < NUMBER_OF_Z_LEVELS; i++)
        {
          if (Math.abs(val - min - (i * (max - min)/ NUMBER_OF_Z_LEVELS )) < TEXTURE_BLACK_ZERO_THRESHOLD * (max - min))
          {
            return true
          }
        }
        return false
      })
    }
    drawSurfaces()
    physicalMouseCoordinates = drawMouseOnParameter()
    drawParameterGrid()
    writeStatus(physicalMouseCoordinates)
  }


  function drag(ev)
  {
    if (surfaces.length == 0)
    {
      return
    }
    //No point is chosen
    if (dragId == -1)
    {
      return
    }

    z = surfaces[currentSurfaceId].points[dragId.i][dragId.j].z
    surfaces[currentSurfaceId].points[dragId.i][dragId.j] = getXY(ev, physicalCanvas)
    surfaces[currentSurfaceId].points[dragId.i][dragId.j].z = z
    redraw()
    ev.preventDefault()
  }

  function calcDistancePhysical(a, b)
  {
    return (a.x - b.x) * (a.x - b.x) + (a.y - b.y) * (a.y - b.y)
  }

  function startDrag(ev)
  {
    pushToHistory()
    var clickCoordinates = getXY(ev, physicalCanvas)

    if (surfaces.length == 0 || surfaces[currentSurfaceId].points.length == 0)
    {
      return
    }

    //Get closest point to the click
    var minimumDistance = width, distanceSquare, xDelta, yDelta
    for (var i = 0; i < surfaces[currentSurfaceId].points.length; i++)
    {
      for (var j = 0; j < surfaces[currentSurfaceId].points[0].length; j++)
      {
        if (!areDragableIndexes(i, j))
        {
          continue
        }
        distanceSquare = calcDistancePhysical(clickCoordinates, surfaces[currentSurfaceId].points[i][j]);
        if ( distanceSquare < minimumDistance )
        {
          dragId = {
            i : i,
            j : j
          }
          minimumDistance = distanceSquare
        }
      }
    }
    z = surfaces[currentSurfaceId].points[dragId.i][dragId.j].z
    surfaces[currentSurfaceId].points[dragId.i][dragId.j] = clickCoordinates
    surfaces[currentSurfaceId].points[dragId.i][dragId.j].z = z
    redraw()
    ev.preventDefault()
  }

  function areDragableIndexes(row, column)
  {
    return ((row == 0 && column == 0) ||
        (row == surfaces[currentSurfaceId].points.length - 1) ||
        (row == 0 && column == surfaces[currentSurfaceId].points[0].length - 1))
  }

  function stopDrag(ev)
  {
    dragId = -1
    ev.preventDefault()
  }

  function mouseUpParameter(ev)
  {
    selectedPointOnParameter = getXY(ev, parameterCanvas)
    redraw()
  }

  function mouseMoveParameter(ev)
  {
    mouseOnParameter = getXY(ev, parameterCanvas)
    if(!shouldDrawJacobian && !shouldDrawDepth)
    {
      redraw()
      return
    }
    if(currentlyDrawingTexture)
    {
      return
    }
    redrawTextureData()
    writeStatusParameter(deCasteljauSurface(surfaces[currentSurfaceId], mouseOnParameter.u, mouseOnParameter.v).pop()[0][0])
  }

  /*
  Redraw the texture on the parameter space from the cache. The cache contains the last
  texture calculated in drawTextureRow function
  */
  function redrawTextureData()
  {

    if((!shouldDrawJacobian && !shouldDrawDepth) || currentlyDrawingTexture)
    {
      return
    }
    for (var row = 0; row < textureData.length; row++)
    {
      for (var column = 0; column < textureData[0].length; column++)
      {
        parameterCtx.fillStyle = textureData[row][column]
        parameterCtx.fillRect(column * HIGH_RES_PIX_PER_SAMPLE / 2 , height1 - row * HIGH_RES_PIX_PER_SAMPLE / 2, HIGH_RES_PIX_PER_SAMPLE, HIGH_RES_PIX_PER_SAMPLE)
      }
    }
  }

  /*
  Calculates and draw the DeCasteljau skeleton of given surface at given u,v coordinates
  For nicer visualization, color the steps in the skeleton with different shades of green.
  */
  function drawSkeleton(surface, u, v)
  {
    skeletonPoints = deCasteljauSurface(surface, u, v)
    for (var k = 1; k < skeletonPoints.length; k++)
    {
      //Different shades of green
      shade = Math.round((240) * k / (skeletonPoints.length - 2) + 10)
      lineColor = "rgb(0, " + shade.toString() + ", 0)"
      //Draw rows on mesh
      for (var i = 0; i < skeletonPoints[k].length; i++)
      {
        drawPolygon(skeletonPoints[k][i], plotWidth, lineColor, SKELETON_POINTS_COLOR, false, -1)
      }
      //Draw columns on mesh
      for (var j = 0; j < skeletonPoints[k][0].length; j++)
      {
        drawPolygon(getColumn(skeletonPoints[k], j), plotWidth, lineColor, SKELETON_POINTS_COLOR, false, -1)
      }
    }
    return skeletonPoints.pop()[0][0]
  }

  /*
  Draw the physical DeCasteljau skeleton of green cross when mouse is over the parameter canvas
  */
  function drawMouseOnParameter()
  {
    if (surfaces.length == 0 || surfaces[currentSurfaceId].points.length == 0 || mouseOnParameter == -1)
    {
      return
    }

    //lines over mouse position, parameter space
    drawParameterLine(mouseOnParameter.u, false, MOUSE_POSITION_COLOR)
    drawParameterLine(mouseOnParameter.v, true, "rgb(0, 255, 0)")

    if (shouldDrawSkeleton)
    {
      physicalMouseCoordinates = drawSkeleton(surfaces[currentSurfaceId],
                                              mouseOnParameter.u,
                                              mouseOnParameter.v)
    }
    else
    {
      //Draw curves
      plotCurveOnSurface(surfaces[currentSurfaceId], mouseOnParameter.u, true, MOUSE_POSITION_COLOR);
      plotCurveOnSurface(surfaces[currentSurfaceId], mouseOnParameter.v, false, MOUSE_POSITION_COLOR);
      //Draw point
      physicalMouseCoordinates = deCasteljauSurface(surfaces[currentSurfaceId], mouseOnParameter.u, mouseOnParameter.v).pop()[0][0]
      drawPolygon([physicalMouseCoordinates], plotWidth, SKELETON_POINTS_COLOR, SKELETON_POINTS_COLOR, false, -1)
    }
    return physicalMouseCoordinates
  }

  //Get x,y between 0 to 1 of given click event
  function getXY(ev, canvas)
  {
    if (!ev.clientX)
    {
      ev = ev.touches[0]
    }
    var rect = canvas.getBoundingClientRect()
    if (canvas == parameterCanvas)
    {
      return {
        u : (ev.clientX - rect.left) / width,
        v : (height1 - (ev.clientY - rect.top)) / height
      }
    }
    point = {
      x : (ev.clientX - rect.left) / width,
      y : (height1 - (ev.clientY - rect.top)) / height,
      z : 0.0
    }
    return zoomPoint(false, point)
  }

  // takes value between 0 to 1 and returns an rgb which
  // represent the color on the visible spectrum at value
  function shadeToColor(value)
  {

    wl = Math.round(((780 - 380) * value) + 380)

    if (wl >= 380 && wl < 440)
    {
        R = -1 * (wl - 440) / (440 - 380);
        G = 0;
        B = 1;
    } else if (wl >= 440 && wl < 490) {
       R = 0;
       G = (wl - 440) / (490 - 440);
       B = 1;
    } else if (wl >= 490 && wl < 510) {
        R = 0;
        G = 1;
        B = -1 * (wl - 510) / (510 - 490);
    } else if (wl >= 510 && wl < 580) {
        R = (wl - 510) / (580 - 510);
        G = 1;
        B = 0;
    } else if (wl >= 580 && wl < 645) {
        R = 1;
        G = -1 * (wl - 645) / (645 - 580);
        B = 0.0;
    } else if (wl >= 645 && wl <= 780) {
        R = 1;
        G = 0;
        B = 0;
    } else {
        R = 0;
        G = 0;
        B = 0;
    }
    return "rgb(" + (R * 100) + "%," + (G * 100) + "%," + (B * 100) + "%)";
  }






//MATHEMATICAL FUNCTIONS


  function makePlanar4(surface)
  {
    while (surface.points.length < 4)
    {
      surface.points.push($.extend(true, [], surface.points[surface.points.length - 1]))
    }
    while (surface.points[0].length < 4)
    {
      for (var i = 0; i < surface.points.length; i++)
      {
        surface.points[i].push($.extend(true, {}, surface.points[i][surface.points[i].length - 1]))
      }
    }
    //X
    surface.points[0][1].x = (2 * surface.points[0][0].x + surface.points[0][3].x ) / 3
    surface.points[0][2].x = (surface.points[0][0].x + 2 * surface.points[0][3].x ) / 3
    surface.points[1][0].x = (2 * surface.points[0][0].x + surface.points[3][0].x ) / 3
    surface.points[1][1].x = (4 * surface.points[0][0].x + 2 * surface.points[0][3].x +
                              2 * surface.points[3][0].x + surface.points[3][3].x) / 9
    surface.points[1][2].x = (2 * surface.points[0][0].x + 4 * surface.points[0][3].x +
                              surface.points[3][0].x +  2 * surface.points[3][3].x) / 9
    surface.points[1][3].x = (2 * surface.points[0][3].x + surface.points[3][3].x ) / 3
    surface.points[2][0].x = (surface.points[0][0].x + 2 * surface.points[3][0].x ) / 3
    surface.points[2][1].x = (2 * surface.points[0][0].x + surface.points[0][3].x +
                              surface.points[3][3].x +  2 * surface.points[3][0].x +
                              3 * surface.points[3][1].x) / 9
    surface.points[2][2].x = (surface.points[0][0].x + 2 * surface.points[0][3].x +
                              2 * surface.points[3][3].x + surface.points[3][0].x +
                              3 * surface.points[3][2].x) / 9
    surface.points[2][3].x = (surface.points[0][3].x + 2 * surface.points[3][3].x ) / 3
    //Y
    surface.points[0][1].y = (2 * surface.points[0][0].y + surface.points[0][3].y ) / 3
    surface.points[0][2].y = (surface.points[0][0].y + 2 * surface.points[0][3].y ) / 3
    surface.points[1][0].y = (2 * surface.points[0][0].y + surface.points[3][0].y ) / 3
    surface.points[1][1].y = (4 * surface.points[0][0].y + 2 * surface.points[0][3].y +
                              2 * surface.points[3][0].y + surface.points[3][3].y) / 9
    surface.points[1][2].y = (2 * surface.points[0][0].y + 4 * surface.points[0][3].y +
                              surface.points[3][0].y +  2 * surface.points[3][3].y) / 9
    surface.points[1][3].y = (2 * surface.points[0][3].y + surface.points[3][3].y ) / 3
    surface.points[2][0].y = (surface.points[0][0].y + 2 * surface.points[3][0].y ) / 3
    surface.points[2][1].y = (2 * surface.points[0][0].y + surface.points[0][3].y +
                              surface.points[3][3].y +  2 * surface.points[3][0].y +
                              3 * surface.points[3][1].y) / 9
    surface.points[2][2].y = (surface.points[0][0].y + 2 * surface.points[0][3].y +
                              2 * surface.points[3][3].y + surface.points[3][0].y +
                              3 * surface.points[3][2].y) / 9
    surface.points[2][3].y = (surface.points[0][3].y + 2 * surface.points[3][3].y ) / 3
  }

  //Receive points of control polygon and the t parameter of the Bezier curve function
  //Return array of arrays of the DeCasteljau points by order:
  //0 - the control points (n points)
  //1 - first level of the skeleton points (n-1 points)
  //...
  //n-1 - the curve point (1 point)
  function deCasteljauCurve(points, t)
  {
    var skeletonPoints = []
    //first run - the control points
    skeletonPoints[0] = points

    //"recursive" runs of the algorithm (implemented not recursively)
    for (var j = 1; j < points.length; j++)
    {
      skeletonPoints[j] = []
      //Skeleton points in current iteration
      for (var i = 0; i < points.length - j; i++)
      {
        skeletonPoints[j][i] = add(mul(skeletonPoints[j-1][i], (1 - t)), mul(skeletonPoints[j-1][i + 1], t))
      }
    }
    return skeletonPoints
  }


  /*
  Using the DeCasteljau algorithm to build the skeleton of given surface
  at given (u,v) point.
  The skeleton returned is an array of matrices, where each matrix represents
  a step of DeCastlejau algorithm. The last matrix in the array will contain a
  single point which is the physical value of the surface at the u,v coordinates.
  When the surface is not NxN, we will end up with a curve and not a single point,
  then we will use the DeCasteljau curve algorithm, and concatenate its skeleton to the deCasteljauSurface one.
  */
  function deCasteljauSurface(surface, u, v)
  {
    //De Casteljau with 2 parameters
    var skeletonPoints = [surface.points]
    for (var k = 0; k < Math.min(surface.points.length, surface.points[0].length) - 1; k++)
    {
      //De Casteljau iteration
      nextStepSkeleton = []
      for (var i = 0; i < skeletonPoints[k].length - 1; i++)
      {
        nextStepSkeletonRow = []
        for (var j = 0; j < skeletonPoints[k][0].length - 1; j++)
        {
          nextStepSkeletonRow.push(
            add(add(  mul(skeletonPoints[k][i][j], (1 - u) * (1 - v)),
                      mul(skeletonPoints[k][i + 1][j], v * (1 - u))),
                add(  mul(skeletonPoints[k][i][j + 1], (1 - v) * u),
                      mul(skeletonPoints[k][i + 1][j + 1], v * u))
                )
            )
        }
        nextStepSkeleton.push(nextStepSkeletonRow)
      }
      skeletonPoints.push(nextStepSkeleton)
    }
    //When the surface is not NxN:
    //Last decasteljau steps, now it's a curve - not a surface
    //If more rows than columns in given points matrix
    if (skeletonPoints[skeletonPoints.length - 1].length > 1)
    {
      var skeletonCurve = deCasteljauCurve(getColumn(skeletonPoints.pop(), 0), v)
      for (var i = 0; i < skeletonCurve.length; i++)
      {
        skeletonPoints.push([skeletonCurve[i]])
      }
      return skeletonPoints
    }
    //If more columns than rows in given points matrix
    if (skeletonPoints[skeletonPoints.length - 1][0].length > 1)
    {
      var skeletonCurve = deCasteljauCurve(skeletonPoints.pop()[0], u)
      for (var i = 0; i < skeletonCurve.length; i++)
      {
        skeletonPoints.push([skeletonCurve[i]])
      }
      return skeletonPoints
    }
    //If given matrix was square
    return skeletonPoints
  }

  /*
  Returns array of 4 points which between them creates a
  plane (patch) which is tangent to the surface on given u,v coordinates.
  Uses method described in "Point and tangent computation" (Thomas W. Sederberg, 1995)
  When the surface is NxN, will return the one-before-last step of the DeCasteljau deCasteljauSurface
  algorithm which contains 2X2 points.
  When the surface is not NxN, we use the points from deCasteljauSurface skeleton before they become a curve.
  This will be an 2xM strip, from which we calculate 4 curves of points received when
  deleting the last / first column and row of the 2xM strip (first-first, first-last, etc).
  The points of the curves at the u / v (depending if its 2xM or Mx2) will be the tangent patch.
  */
  function getTangentPatch(surface, u, v)
  {
    var p00, p01, p10, p11
    rows = surface.points.length
    columns = surface.points[0].length
    if (rows == columns)
    {
      skeleton = deCasteljauSurface(surface, u, v)
      bilinearPatch = skeleton[skeleton.length - 2]
      p00 = bilinearPatch[0][0]
      p10 = bilinearPatch[1][0]
      p01 = bilinearPatch[0][1]
      p11 = bilinearPatch[1][1]

    }
    else if (rows > columns)
    {
      skeleton = deCasteljauSurface(surface, u, v)
      strip = skeleton[columns - 2]
      points00 = getColumn(strip, 0)
      points10 = getColumn(strip, 0)
      points01 = getColumn(strip, 1)
      points11 = getColumn(strip, 1)
      points00.splice(points00.length - 1, 1)
      points01.splice(points01.length - 1, 1)
      points10.splice(0, 1)
      points11.splice(0, 1)

      p00 = deCasteljauCurve(points00, u).pop()[0]
      p01 = deCasteljauCurve(points01, u).pop()[0]
      p10 = deCasteljauCurve(points10, u).pop()[0]
      p11 = deCasteljauCurve(points11, u).pop()[0]
    }
    else
    {
      skeleton = deCasteljauSurface(surface, u, v)
      strip = skeleton[rows - 2]
      points00 = $.extend(true, [], strip[0])
      points01 = $.extend(true, [], strip[0])
      points10 = $.extend(true, [], strip[1])
      points11 = $.extend(true, [], strip[1])
      points00.splice(points01.length - 1, 1)
      points01.splice(0, 1)
      points10.splice(points11.length - 1, 1)
      points11.splice(0, 1)
      p00 = deCasteljauCurve(points00, v).pop()[0]
      p01 = deCasteljauCurve(points01, v).pop()[0]
      p10 = deCasteljauCurve(points10, v).pop()[0]
      p11 = deCasteljauCurve(points11, v).pop()[0]
    }
    return [p00, p01, p10, p11]
  }


  //Calculates the determinant of the Jacobian matrix of given
  //surface at given coordinates
  //To calculate the derivative we first get the 2X2 patch that is tangent to
  //the surface, using getTangentPatch function.
  function getJacobian(surface, u, v)
  {
    if (surface.points.length < 2 || surface.points[0].length < 2)
    {
        //This is a curve, not a surface
        return
    }
    bilinearPatch = getTangentPatch(surface, u, v)
    p00 = bilinearPatch[0]
    p01 = bilinearPatch[1]
    p10 = bilinearPatch[2]
    p11 = bilinearPatch[3]
    /*
    10 -------- 11
    |           |
    |1-v        |1-v
    |    df/du  |
    |---------->|
    |           |
    |v          |v
    |           |
    00 -------- 01

    10 -------- 11
    |  u /\  1-u |
    |    |       |
    |    |df/dv  |
    |    |       |
    |    |       |
    |    |       |
    |  u |  1-u  |
    00 -------- 01
    */
    dfdu = add(mul(sub(p00, p01), (1 - v) * surface.points.length),
               mul(sub(p10, p11), v * surface.points.length))
    dfdv = add(mul(sub(p00, p10), (1 - u) * surface.points[0].length),
               mul(sub(p01, p11), u * surface.points[0].length))

    jacobianDeterminant = (dfdu.x * dfdv.y) - (dfdu.y * dfdv.x)
    /*
    Note:
    We trim the float precision to avoid noise caused by the imprecise nature of
    float arithmetic. It is very visible when presenting an square grid mesh that
    should have a constant Jacobian in every point on it.
    */
    return parseFloat(jacobianDeterminant.toFixed(8))
  }

  //Divides given surface into 4 different surfaces that together have the same shape
  //Adds their index from 1 to 4 to the new sub-surfaces name
  //Uses the subDivideCurve function.
  function subDivideSurface(surface, u, v)
  {
    //Divide on u axis
    var semiSurfaces = [[], []]
    for (var i = 0; i < surface.points.length; i++)
    {
      //split all rows
      var subCurves = subDivideCurve(surface.points[i], v)
      semiSurfaces[0].push(subCurves[0])
      semiSurfaces[1].push(subCurves[1])
    }
    var quadSurfaces = [
      {
        name : surface.name + ".1",
        points : []
      },
      {
        name : surface.name + ".2",
        points : []
      },
      {
        name : surface.name + ".3",
        points : []
      },
      {
        name : surface.name + ".4",
        points : []
      }
    ]

    //divide on u axis
    for (var j = 0; j < 2; j++)
    {
      for (var i = 0; i < semiSurfaces[0][0].length; i++)
      {
        var subCurves = subDivideCurve(getColumn(semiSurfaces[j], i), u)
        quadSurfaces[2 * j].points.push(subCurves[0])
        quadSurfaces[2 * j + 1].points.push(subCurves[1])
      }
    }
    for (var i = 0; i < quadSurfaces.length; i++)
    {
      quadSurfaces[i] = transposeSurface(quadSurfaces[i])
    }
    return quadSurfaces
  }

  // Return two curves that has the same shape of the given curve.
  // The meeting point of the two new curves is the point t on the original curve.
  // Uses DeCasteljau algorithm
  function subDivideCurve(curve, t)
  {
    var skeletonPoints = deCasteljauCurve(curve, t)
    //build two curves
    var postfixCurve = []
    var prefixCurve = []
    //add points to new curves
    for (var i = 0; i < curve.length; i++)
    {
      prefixCurve.push(skeletonPoints[i][0])
      postfixCurve.push(skeletonPoints[curve.length - i - 1][i])
    }
    //add new curves to the curves list
    return [prefixCurve, postfixCurve]
  }

  //Return an array of points at given index from
  //2d points array of given surface
  function getColumn(matrix, index)
  {
    column = []
    for (var i = 0; i < matrix.length; i++)
    {
      column.push(matrix[i][index])
    }
    return column
  }

  //Transpose the 2d array of points representing the given surface
  function transposeSurface(surface)
  {
    var transposedSurface = {
      name : surface.name,
      points : []
    }
    for (var i = 0; i < surface.points[0].length; i++)
    {
      transposedSurface.points.push(getColumn(surface.points, i))
    }
    return transposedSurface
  }
}
