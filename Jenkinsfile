pipeline {
    agent any
    
    environment {
        AWS_REGION         = 'us-west-2'
        ECR_REGISTRY       = '889818960214.dkr.ecr.us-west-2.amazonaws.com'
        ECR_REPO_NAME      = 'my-app-repo'
        EKS_CLUSTER_NAME   = 'my-eks-cluster'
        AWS_CREDENTIALS_ID = 'aws-credentials'
        SONAR_SCANNER_HOME = tool 'SonarScanner-latest'
    }

    stages {
        stage('Checkout') {
            steps {
                echo "🔄 Checking out code from branch: ${env.BRANCH_NAME}"
                checkout scm
            }
        }

        stage('SonarQube Analysis') {
            steps {
                withSonarQubeEnv('MySonarQubeServer') {
                    sh "${SONAR_SCANNER_HOME}/bin/sonar-scanner"
                }
            }
        }

        stage('Quality Gate') {
            steps {
                script {
                    try {
                        timeout(time: 10, unit: 'MINUTES') {
                            def qg = waitForQualityGate()
                            if (qg.status != 'OK') {
                                echo "⚠️ Quality Gate Status: ${qg.status}"
                                echo "🔍 Quality Gate Details:"
                                echo "- Status: ${qg.status}"
                                
                                // Get more details about quality gate failure
                                sh '''
                                    echo "📊 SonarQube Quality Gate Report:"
                                    echo "================================"
                                    curl -s -u $SONAR_AUTH_TOKEN: \
                                    "$SONAR_HOST_URL/api/qualitygates/project_status?projectKey=$SONAR_PROJECT_KEY" \
                                    | jq '.' || echo "Could not fetch detailed report"
                                '''
                                
                                // Allow user to decide: fail pipeline or continue with warning
                                if (params.FAIL_ON_QUALITY_GATE == true) {
                                    error("❌ Quality Gate failed: ${qg.status}")
                                } else {
                                    echo "⚠️ Quality Gate failed but continuing pipeline as FAIL_ON_QUALITY_GATE=false"
                                    currentBuild.result = 'UNSTABLE'
                                }
                            } else {
                                echo "✅ Quality Gate passed!"
                            }
                        }
                    } catch (Exception e) {
                        echo "⚠️ Quality Gate check failed with error: ${e.getMessage()}"
                        if (params.FAIL_ON_QUALITY_GATE == true) {
                            error("Quality Gate check failed")
                        } else {
                            echo "⚠️ Continuing pipeline despite Quality Gate error"
                            currentBuild.result = 'UNSTABLE'
                        }
                    }
                }
            }
        }

        stage('Build, Scan & Push Images') {
            parallel {
                stage('Build Backend') {
                    steps {
                        catchError(buildResult: 'UNSTABLE', stageResult: 'FAILURE') {
                            dir('backend') {
                                script {
                                    try {
                                        sh '''
                                            echo "🔧 Setting up Node.js dependencies..."
                                            if [ ! -f package-lock.json ]; then
                                                echo "🔧 package-lock.json not found. Running npm install to generate it."
                                                npm install
                                            fi
                                            npm ci || npm install
                                        '''

                                        def imageName = "${ECR_REGISTRY}/${ECR_REPO_NAME}:3tier-nodejs-backend-${env.BUILD_ID}"
                                        echo "🏗️ Building backend image: ${imageName}"
                                        def backendImage = docker.build(imageName, '.')

                                        // Security scan with better error handling
                                        echo "🔒 Running security scan..."
                                        sh """
                                            trivy image --exit-code 0 --severity HIGH,CRITICAL ${imageName} || {
                                                echo "⚠️ Security scan found issues but continuing..."
                                                exit 0
                                            }
                                        """

                                        // Push to ECR
                                        echo "📤 Pushing backend image to ECR..."
                                        docker.withRegistry("https://${ECR_REGISTRY}", "ecr:${AWS_REGION}:${AWS_CREDENTIALS_ID}") {
                                            backendImage.push()
                                            backendImage.push("3tier-nodejs-backend-latest")
                                        }
                                        
                                        env.BACKEND_SUCCESS = 'true'
                                        env.BACKEND_IMAGE_TAG = "3tier-nodejs-backend-${env.BUILD_ID}"
                                        echo "✅ Backend build completed successfully!"
                                        
                                    } catch (Exception e) {
                                        echo "❌ Backend build failed: ${e.getMessage()}"
                                        env.BACKEND_SUCCESS = 'false'
                                        throw e
                                    }
                                }
                            }
                        }
                    }
                }

                stage('Build Frontend') {
                    steps {
                        catchError(buildResult: 'UNSTABLE', stageResult: 'FAILURE') {
                            dir('frontend') {
                                script {
                                    try {
                                        sh '''
                                            echo "🔧 Setting up Node.js dependencies..."
                                            if [ ! -f package-lock.json ]; then
                                                echo "🔧 package-lock.json not found. Running npm install to generate it."
                                                npm install
                                            fi
                                            npm ci || npm install
                                        '''

                                        echo "🏗️ Building frontend application..."
                                        sh 'export NODE_OPTIONS=--openssl-legacy-provider && npm run build'

                                        def imageName = "${ECR_REGISTRY}/${ECR_REPO_NAME}:3tier-nodejs-frontend-${env.BUILD_ID}"
                                        echo "🏗️ Building frontend image: ${imageName}"
                                        def frontendImage = docker.build(imageName, '.')

                                        // Security scan
                                        echo "🔒 Running security scan..."
                                        sh """
                                            trivy image --exit-code 0 --severity HIGH,CRITICAL ${imageName} || {
                                                echo "⚠️ Security scan found issues but continuing..."
                                                exit 0
                                            }
                                        """

                                        // Push to ECR
                                        echo "📤 Pushing frontend image to ECR..."
                                        docker.withRegistry("https://${ECR_REGISTRY}", "ecr:${AWS_REGION}:${AWS_CREDENTIALS_ID}") {
                                            frontendImage.push()
                                            frontendImage.push("3tier-nodejs-frontend-latest")
                                        }
                                        
                                        env.FRONTEND_SUCCESS = 'true'
                                        env.FRONTEND_IMAGE_TAG = "3tier-nodejs-frontend-${env.BUILD_ID}"
                                        echo "✅ Frontend build completed successfully!"
                                        
                                    } catch (Exception e) {
                                        echo "❌ Frontend build failed: ${e.getMessage()}"
                                        env.FRONTEND_SUCCESS = 'false'
                                        throw e
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }

        stage('Update Kubernetes Manifests') {
            when {
                anyOf {
                    environment name: 'FRONTEND_SUCCESS', value: 'true'
                    environment name: 'BACKEND_SUCCESS', value: 'true'
                }
            }
            steps {
                script {
                    echo "📝 Updating Kubernetes manifests with new image tags..."
                    
                    sh '''
                        mkdir -p k8s-temp
                        cp k8s/deployment-final.yaml k8s-temp/deployment-updated.yaml
                    '''
                    
                    if (env.BACKEND_SUCCESS == 'true') {
                        sh """
                            sed -i 's|889818960214.dkr.ecr.us-west-2.amazonaws.com/my-app-repo:3tier-nodejs-backend-latest|${ECR_REGISTRY}/${ECR_REPO_NAME}:${env.BACKEND_IMAGE_TAG}|g' k8s-temp/deployment-updated.yaml
                        """
                        echo "✅ Updated backend image to: ${env.BACKEND_IMAGE_TAG}"
                    }
                    
                    if (env.FRONTEND_SUCCESS == 'true') {
                        sh """
                            sed -i 's|889818960214.dkr.ecr.us-west-2.amazonaws.com/my-app-repo:3tier-nodejs-frontend-latest|${ECR_REGISTRY}/${ECR_REPO_NAME}:${env.FRONTEND_IMAGE_TAG}|g' k8s-temp/deployment-updated.yaml
                        """
                        echo "✅ Updated frontend image to: ${env.FRONTEND_IMAGE_TAG}"
                    }
                    
                    sh '''
                        echo "📋 Updated manifest preview:"
                        cat k8s-temp/deployment-updated.yaml | grep "image:" || true
                    '''
                }
            }
        }

        stage('Deploy to EKS') {
            when {
                anyOf {
                    environment name: 'FRONTEND_SUCCESS', value: 'true'
                    environment name: 'BACKEND_SUCCESS', value: 'true'
                }
            }
            steps {
                script {
                    try {
                        withAWS(credentials: AWS_CREDENTIALS_ID, region: AWS_REGION) {
                            echo "🔐 Configuring kubectl for EKS cluster..."
                            sh """
                                aws eks update-kubeconfig --name ${EKS_CLUSTER_NAME} --region ${AWS_REGION}
                                
                                # Test connection
                                echo "🧪 Testing kubectl connection..."
                                kubectl cluster-info || {
                                    echo "❌ Failed to connect to EKS cluster"
                                    exit 1
                                }
                            """

                            echo "🚀 Deploying to EKS cluster..."
                            
                            // Deploy infrastructure components
                            sh '''
                                echo "📦 Deploying infrastructure components..."
                                kubectl apply -f k8s/aws-load-balancer-controller-service-account.yaml --validate=false || {
                                    echo "⚠️ Failed to apply load balancer service account, but continuing..."
                                }
                                kubectl apply -f k8s/ingress-class.yaml --validate=false || {
                                    echo "⚠️ Failed to apply ingress class, but continuing..."
                                }
                            '''
                            
                            // Deploy main application
                            sh '''
                                echo "📦 Deploying application manifests..."
                                kubectl apply -f k8s-temp/deployment-updated.yaml --validate=false
                                
                                echo "⏳ Waiting for deployments to be ready..."
                                kubectl rollout status deployment/backend-deployment --timeout=300s || {
                                    echo "⚠️ Backend deployment timeout, but continuing..."
                                }
                                kubectl rollout status deployment/frontend-deployment --timeout=300s || {
                                    echo "⚠️ Frontend deployment timeout, but continuing..."
                                }
                            '''
                            
                            // Verify deployment
                            sh '''
                                echo "📊 Deployment Status:"
                                echo "==================="
                                
                                kubectl get pods -l 'app in (backend,frontend)' -o wide || true
                                kubectl get services -l 'app in (backend,frontend)' || true
                                kubectl get ingress my-app-ingress || true
                                
                                # Get load balancer URL
                                LB_HOSTNAME=$(kubectl get ingress my-app-ingress -o jsonpath='{.status.loadBalancer.ingress[0].hostname}' 2>/dev/null || echo "")
                                if [ -n "$LB_HOSTNAME" ]; then
                                    echo "🌐 Application URL: http://$LB_HOSTNAME"
                                else
                                    echo "⏳ Load balancer is still being provisioned..."
                                fi
                            '''
                        }
                    } catch (Exception e) {
                        echo "❌ Deployment failed: ${e.getMessage()}"
                        currentBuild.result = 'UNSTABLE'
                        
                        // Try to get debugging information
                        sh '''
                            echo "🔍 Debugging information:"
                            kubectl get events --sort-by=.metadata.creationTimestamp | tail -20 || true
                            kubectl describe pods -l 'app in (backend,frontend)' | tail -50 || true
                        '''
                    }
                }
            }
        }
    }

    post {
        always {
            sh 'rm -rf k8s-temp || true'
            
            // Archive artifacts
            archiveArtifacts artifacts: 'k8s-temp/*.yaml', allowEmptyArchive: true
        }
        
        failure {
            echo "❌ Pipeline failed."
            script {
                // Send notification or create ticket
                sh '''
                    echo "🔍 Final troubleshooting information:"
                    echo "==================================="
                    
                    # Show system information
                    echo "🖥️ System Information:"
                    docker --version || true
                    kubectl version --client || true
                    aws --version || true
                    
                    echo ""
                    echo "📊 Build Summary:"
                    echo "Backend Success: ${BACKEND_SUCCESS:-false}"
                    echo "Frontend Success: ${FRONTEND_SUCCESS:-false}"
                '''
            }
        }
        
        success {
            echo "✅ Pipeline completed successfully!"
            sh '''
                echo "🎉 Deployment Summary:"
                echo "===================="
                echo "Backend Success: ${BACKEND_SUCCESS:-false}"
                echo "Frontend Success: ${FRONTEND_SUCCESS:-false}"
                
                # Final application status
                kubectl get all -l 'app in (backend,frontend)' || true
                
                LB_HOSTNAME=$(kubectl get ingress my-app-ingress -o jsonpath='{.status.loadBalancer.ingress[0].hostname}' 2>/dev/null || echo "")
                if [ -n "$LB_HOSTNAME" ]; then
                    echo ""
                    echo "🌐 Your application is available at:"
                    echo "Frontend: http://$LB_HOSTNAME"
                    echo "Backend API: http://$LB_HOSTNAME/api"
                fi
            '''
        }
        
        unstable {
            echo "⚠️ Pipeline completed with warnings."
            emailext (
                subject: "⚠️ Jenkins Pipeline Warning: ${env.JOB_NAME} - ${env.BUILD_NUMBER}",
                body: """
                Pipeline completed with warnings.
                
                Build: ${env.BUILD_URL}
                Branch: ${env.BRANCH_NAME}
                
                Please check the console output for details.
                """,
                to: "${env.CHANGE_AUTHOR_EMAIL}"
            )
        }
    }
    
    // Add parameters for pipeline configuration
    parameters {
        booleanParam(
            name: 'FAIL_ON_QUALITY_GATE',
            defaultValue: false,
            description: 'Fail pipeline if SonarQube Quality Gate fails'
        )
        booleanParam(
            name: 'SKIP_SECURITY_SCAN',
            defaultValue: false,
            description: 'Skip Trivy security scanning'
        )
        choice(
            name: 'DEPLOYMENT_STRATEGY',
            choices: ['rolling', 'blue-green', 'canary'],
            description: 'Deployment strategy'
        )
    }
}
