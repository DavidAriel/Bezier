$( document ).ready(function()
{
  main( .4, [{"x":0.92,"y":0.14},{"x":0.63,"y":0.74},{"x":0.26,"y":0.71},{"x":0.15,"y":0.19}])
})


function main(scale, points)
{
  var HISTORY_MAX_SIZE = 50
  var CLICK_DISTANCE_THRESHOLD = 0.001
  var history = [], forwardHistory = []
  var currentCurveId = 0
  var timer, deCasteljauRatio = 1
  var selectedPoint = -1
  var curves
  var curveCanvas, polynomialsCanvas, curveCtx, polynomialsCtx, width, height, height1, plotWidth, doublePlotWidth,  dragId = -1
  var iColor = ["#f00000","#00f000","#0000f0","#00f0f0","#f0f000","#f000f0","#090909"]
  init()
  resize()

  function init()
  {
    var curve = {
      points : points,
      startT : 0,
      endT : 1
    }
    curves = [curve]

    updateCurvesList()
    $("#slider").value = $("#slider").max
    curveCanvas = $("#bezierCanvas").get(0)
    curveCtx = curveCanvas.getContext("2d")
    polynomialsCanvas = $("#bernsteinCanvas").get(0)
    polynomialsCtx = polynomialsCanvas.getContext("2d")
    $("#fileInput").change(loadCurves)
    $("#downloadButton").click(saveCurves)
    $("#curvesList").change(changeCurrentCurve)
    $("#bezierCanvas").mousemove(drag)
    $("#bezierCanvas").mousedown(startDrag)
    $("#bezierCanvas").mouseup(stopDrag)
    $("#slider").on("change", function()
    {
      clearInterval(timer)
      deCasteljauRatio = this.value/this.max
      drawCurves()
    })

    //Mobile support
    $(document).keyup(onKeyUp)
    $(document).resize(resize)
  }

  function undo()
  {
    //Nothing in history
    if (history.length == 0)
    {
      return
    }
    forwardHistory.push(curves)

    curves = history.pop()
    if (currentCurveId >= curves.length)
    {
      currentCurveId = 0
    }
    updateCurvesList()
    resize()
  }

  function redo()
  {
    if (forwardHistory.length == 0)
    {
      return
    }
    history.push(curves)
    curves = forwardHistory.pop()
    if (currentCurveId >= curves.length)
    {
      currentCurveId = 0
    }
    updateCurvesList()
    resize()
  }


  function pushToHistory()
  {
    //Deep copy
    curvesCopy = $.extend(true, [], curves)
    history.push(curvesCopy)
    //Keep history size limited
    if (history.length > HISTORY_MAX_SIZE)
    {
      history.shift()
    }
    forwardHistory = []
  }

  function updateCurvesList()
  {
    //remake list element in HTML
    $('#curvesList').empty()
    for (var i=1; i <= curves.length; i++)
    {
      if (i==1)
      {
        $("#curvesList").append($("<option selected/>").text(i))
      }
      else
      {
        $("#curvesList").append($("<option />").text(i))
      }
    }

    //Make sure the current curve is selected
    if($("#curvesList option").size() > currentCurveId)
    {
      $("#curvesList").val(currentCurveId + 1)
      return
    }
    //select first curve
    $("#curvesList").val(1)
  }

  function changeCurrentCurve()
  {
    currentCurveId = $("#curvesList")[0].selectedIndex
    resize()
  }

  //Load curves from file which is selected in "browse..." element
  function loadCurves(ev)
  {
    var file = $("#fileInput")[0].files[0]; // FileList object
    var reader = new FileReader()

    // Closure to capture the file information.
    reader.onload = function(e)
    {
      pushToHistory()
      curves = JSON.parse(reader.result)
      updateCurvesList()
      resize()
    }

    // Read in the image file as a data URL.
    reader.readAsText(file)
  }


  //download current curves in JSON format
  function saveCurves()
  {
    download("curves.json", JSON.stringify(curves))
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
      //DELETE
      case 46:
        deletePoint(ev.ctrlKey)
        break
      //S
      case 83:
        splitCurve()
        break
      //C
      case 67:
        drawDeCasteljau()
        break
      //M
      case 77:
        mergeCurves(0)
        break
      //K
      case 75:
        mergeCurves(1)
        break
      //O
      case 79:
        mergeCurves(2)
        break
      //Z
      case 90:
        if (ev.ctrlKey)
        {
          undo()
        }
        break
      //Y
      case 89:
        if (ev.ctrlKey)
        {
          redo()
        }
        break
      //N
      case 78:
        currentCurveId++
        if (currentCurveId == curves.length)
        {
          currentCurveId = 0
        }
        updateCurvesList()
        resize()
        break
    }
  }

  //If deCasteljauRatio is in the current curve range, make the current curve
  // into two curves with the exact same shape as the current curve, where their
  // meeting point is on the original curve at the deCasteljau as t parameter.
  function splitCurve()
  {
    //check if t value is in range
    if (curves.length == 0 ||
        deCasteljauRatio <= curves[currentCurveId].startT ||
        deCasteljauRatio >= curves[currentCurveId].endT)
    {
      return
    }
    pushToHistory()
    var skeletonPoints = deCasteljau(curves[currentCurveId].points, deCasteljauRatio)
    //build two curves
    var postfixCurve = {
      points : [],
      startT : 0,
      endT : (curves[currentCurveId].endT - deCasteljauRatio) / (1 - deCasteljauRatio)
    }
    var prefixCurve = {
      points : [],
      startT : curves[currentCurveId].startT / deCasteljauRatio,
      endT : 1
    }
    //add points to new curves
    for (var i = 0; i < curves[currentCurveId].points.length; i++)
    {
      prefixCurve.points.push(skeletonPoints[i][0])
      postfixCurve.points.push(skeletonPoints[curves[currentCurveId].points.length - i - 1][i])
    }
    //add new curves to the curves list
    curves[currentCurveId] = prefixCurve
    curves.push(postfixCurve)

    updateCurvesList()
    deCasteljauRatio = 1
    resize()
  }

  //Start a timer that draws the moving DeCasteljau skeleton
  function drawDeCasteljau()
  {
    deCasteljauRatio = 0
    clearInterval(timer)
    timer = window.setInterval(stepDeCasteljau, 5)
  }
  //Advance the current deCasteljauRatio and draw the Bezier curve with
  //the DeCasteljau skeleton.
  function stepDeCasteljau()
  {
    deCasteljauRatio += 0.001
    //Stop
    if(deCasteljauRatio >= 1)
    {
      clearInterval(timer)
      return
    }
    $("#slider").val(deCasteljauRatio * $("#slider").prop('max'))
    drawCurves()
  }

  //Add point as last in polygon, coordinates are between 0 to 1
  //If isNewCurve is true create a new curve and add the point to it.
  //Otherwise adds the point to the current curve.
  function addPoint(newPoint, isNewCurve)
  {
    if (!isNewCurve && curves.length > 0)
    {
      curves[currentCurveId].points.push(newPoint)
      resize()
      return
    }
    curves.push({
      points : [newPoint],
      startT : 0,
      endT : 1
    })
    currentCurveId = curves.length - 1
    updateCurvesList()
    resize()
  }

  //Delete last point in polygon of the current curve.
  //remove curve if it has no points
  function deletePoint(deleteCurve)
  {
    if (curves.length == 0)
    {
      return
    }
    pushToHistory()
    curves[currentCurveId].points.pop()
    //curve is empty, delete it
    if (deleteCurve || curves[currentCurveId].points.length == 0)
    {
      curves.splice(currentCurveId, 1)
      if (currentCurveId > 0)
      {
        currentCurveId--
      }
      updateCurvesList()
    }
    resize()
  }

  //Find the curve with beginning or end closest to the beginning or end
  //of the current curve.
  //Return the closest curve id.
  function findClosestCurve()
  {
    var minimum = 1
    var minimumId = currentCurveId
    for (var i = 0; i < curves.length; i++)
    {
      if (i != currentCurveId)
      {
        var distanceSquare = standardMeeting(currentCurveId, i)
        if (distanceSquare < minimum)
        {
          minimum = distanceSquare
          minimumId = i
        }
      }
    }
    return minimumId
  }



  //Use the current curve as master and the closest to it as slave,
  //make their points order "standard" (see standardMeeting with reverseToStandard true)
  //Makes slave meet the master so the derivatives up to the derLevel are continuous.
  //Note: ratio variable is set so is user split and then merge a curve, the slave's dots don't move.
  //derLevel = 0 -> the curves are continuous
  //derLevel = 1 -> the curves are differentiable
  //derLevel = 2 -> the curves 2nd derivatives are continuous
  function mergeCurves(derLevel)
  {
    if (curves.length == 0)
    {
      return
    }
    pushToHistory()
    var slaveId = findClosestCurve()
    var masterId = currentCurveId
    //Curves without enough points or not enough curves
    if (curves[masterId].points.length <= derLevel
        || curves[slaveId].points.length <= derLevel)
    {
      return
    }
    //Flip curves order if necessary, so last of master is close to first of slave
    standardMeeting(masterId, slaveId, true)

    //Master points - P0,P1,...,Pm-1
    //Slave points - Q0,Q1,...,Qn-1
    //Q0 = Pm-1
    var masterLastPoint1 = curves[masterId].points[curves[masterId].points.length - 1]
    originalSlaveFirstPoint1 = $.extend({}, curves[slaveId].points[0])
    curves[slaveId].points[0] = $.extend({}, masterLastPoint1)
    if (derLevel < 1)
    {
      resize()
      return
    }
    var masterLastPoint2 = curves[masterId].points[curves[masterId].points.length - 2]
    //r = Q1-Q0/Pm-1-Pm-2
    var ratio = calcDistanceSquare(curves[slaveId].points[1], originalSlaveFirstPoint1)
    ratio = Math.sqrt(ratio / calcDistanceSquare(masterLastPoint2, masterLastPoint1))
    //Q1 = (r1 + 1)Pm-1 - (r1)Pm-2
    curves[slaveId].points[1].x = (1 + ratio) * masterLastPoint1.x - ratio * masterLastPoint2.x
    curves[slaveId].points[1].y = (1 + ratio) * masterLastPoint1.y - ratio * masterLastPoint2.y

    if (derLevel < 2)
    {
      resize()
      return
    }
    var masterLastPoint3 = curves[masterId].points[curves[masterId].points.length - 3]
    //Q2 = ((r+1)^2)*Pm-1 - 2(r+1)*r*Pm-2 + (r^2)P-3
    curves[slaveId].points[2].x = (ratio + 1) * (ratio + 1) * masterLastPoint1.x
    curves[slaveId].points[2].x -= 2 * (ratio + 1) * ratio * masterLastPoint2.x
    curves[slaveId].points[2].x += ratio * ratio * masterLastPoint3.x
    curves[slaveId].points[2].y = (ratio + 1) * (ratio + 1) * masterLastPoint1.y
    curves[slaveId].points[2].y -= 2 * (ratio + 1) * ratio * masterLastPoint2.y
    curves[slaveId].points[2].y += ratio * ratio * masterLastPoint3.y

    resize()
  }

  //if reverseToStandard is false, return the square distance between the closest
  //points of the two given curves.
  //otherwise flip the curves points  order (if needed) so that the last point of
  //the master and the first of the slave would be closest.
  function standardMeeting(masterId, slaveId, reverseToStandard)
  {
    var masterPoints = curves[masterId].points
    var slavePoints = curves[slaveId].points

    var firstToFirst = calcDistanceSquare(masterPoints[0], slavePoints[0])
    var firstToLast = calcDistanceSquare(masterPoints[0], slavePoints[slavePoints.length - 1])
    var lastToFirst = calcDistanceSquare(masterPoints[masterPoints.length - 1], slavePoints[0])
    var lastToLast = calcDistanceSquare(masterPoints[masterPoints.length - 1], slavePoints[slavePoints.length - 1])
    if (!reverseToStandard)
    {
      return Math.min(firstToFirst, firstToLast, lastToFirst, lastToLast)
    }
    switch (Math.min(firstToFirst, firstToLast, lastToFirst, lastToLast))
    {
      case firstToFirst:
        curves[masterId].points = masterPoints.reverse()
        break
      case firstToLast:
        curves[masterId].points = masterPoints.reverse()
        curves[slaveId].points = slavePoints.reverse()
        break
      case lastToLast:
        curves[slaveId].points = slavePoints.reverse()
        break
    }
  }

  function binomialCoefficient(n, v)
  {
    value = 1
    for (var i = 0; i < v; i++)
    {
      value *= n-i
      value /= i + 1
    }
    return value
  }

  function hexToRgb(hex) {
      var result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
      return result ? {
          r: parseInt(result[1], 16),
          g: parseInt(result[2], 16),
          b: parseInt(result[3], 16)
      } : null;
  }

  function genBernPolyEquation(n, v)
  {
    rgb = hexToRgb(iColor[v % 7])
    str = ""
    str += "\\definecolor{" + v.toString() + "}{RGB}{" + rgb.r.toString() + "," +
                                                         rgb.g.toString() + "," +
                                                         rgb.b.toString() + "} "
    str += "\\color{" + v.toString() + "} \\blacksquare \\ \\ \\color{black} "
    str += "B_" + v.toString() + "^" + n.toString() + "(t)="
    coefficient = binomialCoefficient(n,v)
    if (coefficient > 1)
    {
      str += coefficient.toString() + "\\cdot "
    }
    if (v > 0)
    {
      str += "t^" + v.toString()
    }
    if (v >0 && n-v > 0)
    {
      str += "\\cdot "
    }
    if(n - v > 0)
    {
      str += "(1-t)^"+(n-v).toString()
    }
    return str
  }
 function writeBernPolynomials(n)
 {
    if (MathJax.Hub.getAllJax("MathDiv").length == 0)
    {
      setTimeout(function(){writeBernPolynomials(n)}, 5)
      return
    }
    var math = MathJax.Hub.getAllJax("MathDiv")[0]

    str = ""
    for (v = 0; v <= n; v++)
    {
      str += "\\\\" + genBernPolyEquation(n, v)
    }
    MathJax.Hub.Queue(["Text",math,str]);
  }

  //Draws the Bernstein Polynomials of current curve
  function drawBernsteinPolynomial()
  {
    if (curves.length == 0)
    {
      return
    }
    //Setup
    var step = doublePlotWidth / (width - doublePlotWidth)
    var t = step
    var lastStepValues = new Float64Array(curves[currentCurveId].points.length + 1)
    var currentStepValues = new Float64Array(curves[currentCurveId].points.length + 1)
    currentStepValues[1] = height1
    polynomialsCtx.clearRect(0,0, width, height)
    polynomialsCtx.lineWidth = plotWidth
    //Each pixel on the X axis
    for (var k = doublePlotWidth; k < width; k += doublePlotWidth)
    {
      lastStepValues.set(currentStepValues)
      //Clean current step
      currentStepValues = new Float64Array(curves[currentCurveId].points.length + 1)
      currentStepValues[1] = height1
      //Calc current pixel location - Bernstein polynomials
      for (var j = 1; j < curves[currentCurveId].points.length; j++)
      {
        for (var i = j+1; i > 0; i--)
        {
          currentStepValues[i] = (1 - t) * currentStepValues[i] + t * currentStepValues[i-1]
        }
      }
      //Plot
      for (var poliynomialId = 1; poliynomialId < curves[currentCurveId].points.length + 1; poliynomialId++)
      {
        polynomialsCtx.strokeStyle = iColor[(poliynomialId - 1) % 7]
        polynomialsCtx.beginPath()
        polynomialsCtx.moveTo(k - doublePlotWidth, height1 - lastStepValues[poliynomialId])
        polynomialsCtx.lineTo(k, height1 - currentStepValues[poliynomialId])
        polynomialsCtx.stroke()
      }
      t += step
    }
  }

  //Add to canvas lines and dots of given polygon
  // (polygon is open, last and first dots are not drawn)
  // used to draw the control polygon and the DeCasteljau skeleton
  function drawPolygon(polygonPoints, lineWidth, lineColor, dotColor, isCurrent)
  {
      curveCtx.lineWidth = lineWidth
      curveCtx.beginPath()
      curveCtx.moveTo(polygonPoints[0].x, height1 - polygonPoints[0].y)
      for (var i = 0; i < polygonPoints.length; i++)
      {
        //Dot
        if(selectedPoint == i && isCurrent)
        {
          curveCtx.strokeStyle = "#00ffff"

          curveCtx.strokeRect(polygonPoints[i].x - plotWidth * 2,
                            height1 - polygonPoints[i].y - plotWidth * 2,
                            plotWidth * 4,
                            plotWidth * 4)
        }
        else
        {
          curveCtx.strokeStyle = dotColor
          curveCtx.strokeRect(polygonPoints[i].x - plotWidth,
                              height1 - polygonPoints[i].y - plotWidth,
                              plotWidth * 2,
                              plotWidth * 2)
        }
        if (isCurrent)
        {
          //Write Point id
          curveCtx.stroke()
          curveCtx.font="30px Courier New"
          curveCtx.fillText("P".concat(i), polygonPoints[i].x + 10, height1 - polygonPoints[i].y)
        }

        //Line
        curveCtx.strokeStyle = lineColor
        curveCtx.lineTo(polygonPoints[i].x, height1 - polygonPoints[i].y)
        curveCtx.stroke()
      }
  }

  //Draw all curves on the canvas using drawCurves function
  function drawCurves()
  {
    //zoom out if needed
    while(isExceedingCanvas())
    {
      correctZoom()
    }
    curveCtx.clearRect(0,0, width, height)
    for (var i = 0; i < curves.length; i++)
    {
      drawCurve(curves[i], i == currentCurveId)
    }
    if (deCasteljauRatio == 1)
    {
      return
    }
    //Write the t value
    curveCtx.font="30px Courier New"
    curveCtx.fillText("t=" + deCasteljauRatio.toFixed(2), 30, 30)
  }

  //Adds to canvas a single curve (color are stronger if isCurrent is true)
  //Draw:
  // Control polygon
  // Bezier curve (using the DeCasteljau function for the calculation)
  // DeCasteljau skeleton (only if current DeCasteljau value is in the curve range)
  function drawCurve(curve, isCurrent)
  {
    var step = 1 / width
    var points = []
    //Set x,y in canvas coordinates, plot control points
    for (var i = 0; i < curve.points.length; i++)
    {
      points[i] = {
        x : curve.points[i].x * width,
        y : curve.points[i].y * height1
      }
    }

    //plot control polygon lines
    curveCtx.lineWidth = plotWidth
    //disabled colors
    var lineColor = "#e0e0e0"
    var dotColor = "#a0a0a0"
    if (isCurrent)
    {
      //enabled colors
      lineColor = "#0000f5"
      dotColor = "#0000f0"
    }
    drawPolygon(points, plotWidth, lineColor, dotColor, isCurrent)

    //plot curve
    curveCtx.lineWidth = doublePlotWidth

    var startCurve = deCasteljau(points, t).pop()[0]
    var lastStep = startCurve
    var curveColor = "#a04040"
    if (isCurrent)
    {
      curveColor = "#f00000"
    }
    //Draw Curve step
    for (var t = curve.startT; t < curve.endT; t += step)
    {
      curveStep = deCasteljau(points, t).pop()[0]
      curveCtx.strokeStyle = curveColor
      curveCtx.beginPath()
      curveCtx.moveTo(lastStep.x, height1 - lastStep.y)
      curveCtx.lineTo(curveStep.x, height1 - curveStep.y)
      curveCtx.stroke()
      lastStep = curveStep
    }
    //Draw De Casteljau skeleton
    if (deCasteljauRatio > curve.startT && deCasteljauRatio < curve.endT)
    {
      var deCasteljauPoints = deCasteljau(points, deCasteljauRatio)
      for (var j = 1; j < deCasteljauPoints.length; j++)
      {
        drawPolygon(deCasteljauPoints[j], plotWidth, "#00f000", "#0f0f0f", false)
      }
    }
  }

  //Receive points of control polygon and the t parameter of the Bezier function
  //Return array of arrays of the DeCasteljau points by order:
  //0 - the control points (n points)
  //1 - first level of the skeleton points (n-1 points)
  //...
  //n-1 - the curve point (1 point)
  function deCasteljau(points, t)
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
        skeletonPoints[j][i] = {
          x : (1 - t) * skeletonPoints[j-1][i].x + t * skeletonPoints[j-1][i + 1].x,
          y : (1 - t) * skeletonPoints[j-1][i].y + t * skeletonPoints[j-1][i + 1].y
        }
      }
    }
    return skeletonPoints
  }

  function correctZoom()
  {
    for (var k = 0; k < curves.length; k++)
    {
      for (var i = 0; i < curves[k].points.length; i++)
      {
        curves[k].points[i].x -= .5
        curves[k].points[i].x *= .9
        curves[k].points[i].x += .5
        curves[k].points[i].y -= .5
        curves[k].points[i].y *= .9
        curves[k].points[i].y += .5
      }
    }
  }

  function isExceedingCanvas()
  {
    for (var k = 0; k < curves.length; k++)
    {
      for (var i = 0; i < curves[k].points.length; i++)
      {
        if (curves[k].points[i].x < 0 || curves[k].points[i].x > 1 ||
            curves[k].points[i].y < 0 || curves[k].points[i].y > 1)
          return true
      }
    }
    return false
  }

  function resize()
  {
    height = width = Math.round(window.innerWidth * scale)
    height1 = height-1
    plotWidth = Math.max(1, Math.round(width / 250))
    doublePlotWidth = 2 * plotWidth
    curveCanvas.width = width
    curveCanvas.height = height
    polynomialsCanvas.width = width
    polynomialsCanvas.height = height
    drawBernsteinPolynomial()
    writeBernPolynomials(curves[currentCurveId].points.length - 1)
    drawCurves()
  }


  function drag(ev)
  {
    if (curves.length == 0)
    {
      return
    }
    //Not in drag
    if (dragId < 0)
    {
      selectedPoint = findClosestPoint(getXY(ev))
      drawCurves()
      return
    }
    curves[currentCurveId].points[dragId] = getXY(ev)
    drawCurves()
    ev.preventDefault()
  }

  function calcDistanceSquare(a, b)
  {
    return (a.x - b.x) * (a.x - b.x) + (a.y - b.y) * (a.y - b.y)
  }

  function startDrag(ev)
  {
    pushToHistory()
    var clickCoordinates = getXY(ev)
    if (ev.ctrlKey)
    {
      addPoint(clickCoordinates, ev.shiftKey)
      return
    }
    dragId = findClosestPoint(clickCoordinates)
    if (dragId == -1)
    {
      return
    }
    selectedPoint = dragId
    curves[currentCurveId].points[dragId] = clickCoordinates
    drawCurves()
    ev.preventDefault()
  }

  function findClosestPoint(clickCoordinates)
  {

    var closestId = -1
    //Get closest point to the click
    var minimumDistance = width, distanceSquare, xDelta, yDelta
    for (var i = 0; i < curves[currentCurveId].points.length; i++)
    {
      distanceSquare = calcDistanceSquare(clickCoordinates, curves[currentCurveId].points[i]);
      if ( distanceSquare < minimumDistance )
      {
        closestId = i
        minimumDistance = distanceSquare
      }
    }
    if (minimumDistance > CLICK_DISTANCE_THRESHOLD)
    {
      return -1
    }
    return closestId
  }
  function stopDrag(ev)
  {

    dragId = -1
    ev.preventDefault()
  }

  //Get x,y between 0 to 1 of given click event
  function getXY(ev)
  {
    if (!ev.clientX)
    {
      ev = ev.touches[0]
    }
    var rect = curveCanvas.getBoundingClientRect()
    return {
      x : (ev.clientX - rect.left) / width,
      y : (height1 - (ev.clientY - rect.top)) / height
    }
  }
}
